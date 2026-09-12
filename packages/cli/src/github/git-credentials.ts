/** Git's helper protocol carries credentials over a pipe, never argv or remote URLs.
 * The helper is ephemeral (-c), answers only for this exact GitHub repository, and
 * ignores store/erase so another credential helper cannot persist the token.
 */
export function gitCredentialOptions(repo: string, token?: string) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^GIT_/i.test(key) || /^(SSH_ASKPASS|AIUSAGE_GITHUB_TOKEN|AIUSAGE_GIT_CREDENTIAL)$/i.test(key)) delete env[key]
  }
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const args = ['-c', 'credential.helper=', '-c', 'credential.useHttpPath=true',
    '-c', 'http.extraHeader=', '-c', 'http.followRedirects=false', '-c', 'core.hooksPath=/dev/null',
    '-c', 'user.name=AIUsage', '-c', 'user.email=aiusage@localhost', '-c', 'commit.gpgSign=false']
  if (token) {
    env.AIUSAGE_GIT_CREDENTIAL = token
    // This source contains no secrets; shell single quotes prevent expansion.
    const source = `if(process.argv[1]==='get'){let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=Object.fromEntries(s.trim().split('\\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));if(p.protocol==='https'&&p.host==='github.com'&&p.path===${JSON.stringify(`${repo}.git`)})process.stdout.write('username=x-access-token\\npassword='+process.env.AIUSAGE_GIT_CREDENTIAL+'\\n\\n')})}`
    const quote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`
    args.push('-c', `credential.helper=!${quote(process.execPath.replace(/\\/g, '/'))} -e ${quote(source)}`)
  }
  return { args, env }
}
