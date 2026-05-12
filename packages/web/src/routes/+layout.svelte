<script>
  import { page } from '$app/stores';
</script>

<nav>
  <a href="/" class:active={$page.url.pathname === '/'}>Overview</a>
  <a href="/tokens" class:active={$page.url.pathname === '/tokens'}>Tokens</a>
  <a href="/cost" class:active={$page.url.pathname === '/cost'}>Cost</a>
  <a href="/models" class:active={$page.url.pathname === '/models'}>Models</a>
  <a href="/tool-calls" class:active={$page.url.pathname === '/tool-calls'}>Tool Calls</a>
  <a href="/sessions" class:active={$page.url.pathname === '/sessions'}>Sessions</a>
</nav>

<main>
  <slot />
</main>

<style>
  nav {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: #f5f5f5;
  }
  a {
    text-decoration: none;
    color: #333;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }
  a.active {
    background: #007bff;
    color: white;
  }
  main {
    padding: 2rem;
  }
</style>
