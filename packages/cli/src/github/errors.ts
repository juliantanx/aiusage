/** Only fixed, locally authored messages may use this class. Never wrap remote
 * response bodies, native keychain errors, or child-process errors in it.
 */
export class GitHubAuthError extends Error {}

export function safeGitHubError(error: unknown): string {
  return error instanceof GitHubAuthError ? error.message : 'GitHub operation failed. Check connectivity, App installation, and repository access.'
}
