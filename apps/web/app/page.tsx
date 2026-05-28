export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>Deal Match</h1>
      <p style={{ fontSize: "1.1rem", opacity: 0.8, lineHeight: 1.6 }}>
        A browser extension that tells you whether the product you&apos;re
        looking at is actually a good deal — by checking its price history
        and comparing it against other retailers in real time.
      </p>
      <p style={{ marginTop: "2rem", opacity: 0.6 }}>
        Backend API:{" "}
        <code style={{ background: "#1b1f24", padding: "2px 6px" }}>
          POST /api/analyze
        </code>
      </p>
    </main>
  );
}
