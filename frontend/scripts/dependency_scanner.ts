/**
 * 功能：
 *     扫描 src 目录下的 TypeScript 与 Vue 文件依赖关系。
 *
 * 总体结构：
 *     1. collectSourceFiles()
 *     2. extractDependencies()
 *     3. resolveDependencyPath()
 *     4. buildDependencyGraph()
 *
 * 外部如何使用：
 *     使用 tsx 执行本文件，生成 dependency_graph.json。
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * 功能：
 *     单个文件的依赖关系描述。
 *
 * 规则：
 *     1. file 表示当前文件。
 *     2. dependencies 表示当前文件直接依赖的项目内文件。
 */
interface FileDependency {
    file: string
    dependencies: string[]
}

const projectRoot = process.cwd()
const srcRoot = path.resolve(projectRoot, 'src')
const reportDir = path.resolve(
    projectRoot,
    'project_report',
)

const outputPath = path.resolve(
    reportDir,
    'dependency_graph.json',
)


const sourceExtensions = ['.ts', '.vue']

/**
 * 功能：
 *     递归收集 src 目录下的源码文件。
 *
 * 规则：
 *     1. 只收集 .ts 与 .vue。
 *     2. 忽略 node_modules。
 */
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

/**
 * 功能：
 *     从源码文本中提取 import / export from 依赖。
 *
 * 规则：
 *     1. 只提取静态依赖。
 *     2. 不处理动态 import()。
 */
function extractDependencies(content: string): string[] {
    const dependencies: string[] = []
    const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

    let match = importRegex.exec(content)

    while (match) {
        const dependency = match[1]

        if (dependency) {
            dependencies.push(dependency)
        }

        match = importRegex.exec(content)
    }

    return dependencies
}


/**
 * 功能：
 *     将依赖路径解析为项目内文件路径。
 *
 * 规则：
 *     1. @/ 开头表示 src 根目录。
 *     2. ./ 与 ../ 表示相对当前文件。
 *     3. 第三方依赖不进入结果。
 */
function resolveDependencyPath(currentFile: string, dependency: string): string | null {
    if (!dependency.startsWith('@/') && !dependency.startsWith('./') && !dependency.startsWith('../')) {
        return null
    }

    const basePath = dependency.startsWith('@/')
        ? path.resolve(srcRoot, dependency.replace('@/', ''))
        : path.resolve(path.dirname(currentFile), dependency)

    const candidatePaths = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.vue`,
        path.resolve(basePath, 'index.ts'),
    ]

    const resolvedPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))

    if (!resolvedPath) {
        return null
    }

    return path.relative(srcRoot, resolvedPath).replaceAll(path.sep, '/')
}

/**
 * 功能：
 *     构建项目源码依赖图。
 *
 * 规则：
 *     1. file 使用相对 src 的路径。
 *     2. dependencies 只保留项目内部依赖。
 */
function buildDependencyGraph(): FileDependency[] {
    const files = collectSourceFiles(srcRoot)

    return files.map((file) => {
        const content = fs.readFileSync(file, 'utf-8')
        const rawDependencies = extractDependencies(content)

        const dependencies = rawDependencies
            .map((dependency) => resolveDependencyPath(file, dependency))
            .filter((dependency): dependency is string => dependency !== null)

        return {
            file: path.relative(srcRoot, file).replaceAll(path.sep, '/'),
            dependencies,
        }
    })
}

const dependencyGraph = buildDependencyGraph()

if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {
        recursive: true,
    })
}

fs.writeFileSync(
    outputPath,
    JSON.stringify(dependencyGraph, null, 4),
    'utf-8',
)


fs.writeFileSync(outputPath, JSON.stringify(dependencyGraph, null, 4), 'utf-8')

console.log(`dependency graph generated: ${outputPath}`)
