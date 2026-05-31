/**
 * dependency_scanner.ts
 *
 * 功能：
 *     扫描项目 src 和 scripts 下所有 .ts 与 .vue 文件的静态 import/export 依赖，
 *     输出 dependency_graph.json，其中节点为文件，边为依赖关系，边 label 为导入的符号。
 *
 * 输出：
 *     project_report/dependency_graph.json
 *
 * 使用：
 *     pnpm tsx scripts/dependency_scanner.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// ------------------------- 配置 -------------------------

const projectRoot = process.cwd()
const srcRoots = [path.resolve(projectRoot, 'src'), path.resolve(projectRoot, 'scripts')]
const reportDir = path.resolve(projectRoot, 'project_report')
const outputPath = path.resolve(reportDir, 'dependency_graph.json')

const sourceExtensions = ['.ts', '.vue']

// ------------------------- 类型 -------------------------

interface DependencyEdge {
    source: string // 被导入文件
    target: string // 导入者文件
    imports: string[] // 导入符号
}

interface DependencyGraph {
    nodes: { id: string }[]
    edges: DependencyEdge[]
}

// ------------------------- 工具函数 -------------------------

// 递归收集指定目录下的源码文件
function collectSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
        const fullPath = path.resolve(dir, entry.name)

        if (entry.isDirectory()) {
            files.push(...collectSourceFiles(fullPath))
            continue
        }

        if (sourceExtensions.includes(path.extname(entry.name))) {
            files.push(fullPath)
        }
    }

    return files
}

// 提取 .vue <script> 和 <script setup> 内容
function extractVueScriptContent(filePath: string, content: string): string {
    if (!filePath.endsWith('.vue')) return content

    const scriptMatches = Array.from(content.matchAll(/<script(?:\s+setup)?[^>]*>([\s\S]*?)<\/script>/gi))
    if (!scriptMatches.length) return ''

    return scriptMatches.map((m) => m[1]).join('\n')
}

// 解析 TypeScript AST 获取依赖
function parseFileDependencies(filePath: string, content: string): DependencyEdge[] {
    const edges: DependencyEdge[] = []
    const relativeFile = path.relative(projectRoot, filePath).replaceAll(path.sep, '/')
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
            const moduleText = (node.moduleSpecifier as ts.StringLiteral).text
            const resolved = resolveDependencyPath(filePath, moduleText)
            if (!resolved) return

            const imports: string[] = []

            if (node.importClause) {
                if (node.importClause.name) {
                    imports.push('default:' + node.importClause.name.text)
                }
                if (node.importClause.namedBindings) {
                    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                        imports.push('* as ' + node.importClause.namedBindings.name.text)
                    } else if (ts.isNamedImports(node.importClause.namedBindings)) {
                        for (const elem of node.importClause.namedBindings.elements) {
                            if (elem.isTypeOnly) {
                                imports.push('type:' + elem.name.text)
                            } else {
                                imports.push(elem.name.text)
                            }
                        }
                    }
                }
            } else {
                imports.push('(side-effect)')
            }

            edges.push({
                source: resolved,
                target: relativeFile,
                imports
            })
        }

        else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            const moduleText = (node.moduleSpecifier as ts.StringLiteral).text
            const resolved = resolveDependencyPath(filePath, moduleText)
            if (!resolved) return

            const imports: string[] = []

            if (node.exportClause) {
                if (ts.isNamedExports(node.exportClause)) {
                    for (const elem of node.exportClause.elements) {
                        imports.push(elem.name.text)
                    }
                }
            } else {
                imports.push('*')
            }

            edges.push({
                source: resolved,
                target: path.relative(projectRoot, filePath).replaceAll(path.sep, '/'),
                imports
            })
        }
    })

    return edges
}

// 将依赖路径解析为项目内部文件
function resolveDependencyPath(currentFile: string, dependency: string): string | null {
    if (!dependency.startsWith('@/') && !dependency.startsWith('./') && !dependency.startsWith('../') && !dependency.endsWith('.css')) {
        return dependency // 第三方库保留原名
    }

    const basePath = dependency.startsWith('@/')
        ? path.resolve(projectRoot, 'src', dependency.replace('@/', ''))
        : path.resolve(path.dirname(currentFile), dependency)

    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.vue`,
        path.resolve(basePath, 'index.ts')
    ]

    const resolved = candidates.find((p) => fs.existsSync(p))
    return resolved ? path.relative(projectRoot, resolved).replaceAll(path.sep, '/') : dependency
}

// ------------------------- 扫描主逻辑 -------------------------

function buildDependencyGraph(): DependencyGraph {
    const allFiles: string[] = srcRoots.flatMap((r) => collectSourceFiles(r))
    const edges: DependencyEdge[] = []
    const nodeSet: Set<string> = new Set()

    for (const file of allFiles) {
        let content = fs.readFileSync(file, 'utf-8')
        content = extractVueScriptContent(file, content)
        const fileEdges = parseFileDependencies(file, content)
        fileEdges.forEach((e) => {
            edges.push(e)
            nodeSet.add(e.source)
            nodeSet.add(e.target)
        })
    }

    const nodes = Array.from(nodeSet).map((id) => ({ id }))
    return { nodes, edges }
}

// ------------------------- 输出 -------------------------

if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
}

const graph = buildDependencyGraph()
fs.writeFileSync(outputPath, JSON.stringify(graph, null, 4), 'utf-8')

console.log(`dependency graph generated at: ${outputPath}`)
