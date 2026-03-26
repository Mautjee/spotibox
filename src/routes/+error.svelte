<script>
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Error {$page.status} — SpotyBox</title>
</svelte:head>

<div class="error-page">
  <div class="error-card glass">
    <p class="error-status">{$page.status}</p>
    <h1 class="error-title">{$page.error?.message ?? 'Something went wrong'}</h1>
    <a href="/" class="error-btn">Go back home</a>
  </div>
</div>

<style>
  .error-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0A0A0F;
    padding: 1rem;
  }

  .error-card {
    text-align: center;
    padding: 3rem 2rem;
    max-width: 400px;
    width: 100%;
  }

  .error-status {
    font-size: 5rem;
    font-weight: 800;
    color: #3B82F6;
    text-shadow: 0 0 40px rgba(59, 130, 246, 0.6);
    line-height: 1;
    margin: 0 0 0.5rem;
  }

  .error-title {
    font-size: 1.25rem;
    color: #A0A0B0;
    margin: 0 0 2rem;
    font-weight: 400;
  }

  .error-btn {
    display: inline-block;
    background: #3B82F6;
    color: #ffffff;
    padding: 0.75rem 2rem;
    border-radius: 9999px;
    font-weight: 600;
    text-decoration: none;
    box-shadow: 0 0 16px 4px rgba(59, 130, 246, 0.4);
    transition: opacity 0.2s;
  }

  .error-btn:hover {
    opacity: 0.85;
  }
</style>
