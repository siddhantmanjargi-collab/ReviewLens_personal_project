export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.6 }}>
      <h1>ReviewLens backend</h1>
      <p>This is an API-only service. Try:</p>
      <ul>
        <li><code>/api/health</code></li>
        <li><code>/api/products</code></li>
      </ul>
    </main>
  );
}
