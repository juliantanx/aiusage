export function extractProject(sourceFile: string): string {
  return sourceFile.includes('.claude/projects/') ? 'aiusage' : 'unknown'
}
