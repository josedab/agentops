import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

export default function NotFound(): React.JSX.Element {
  return (
    <Layout title="Page Not Found">
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "60vh",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ fontSize: "6rem", marginBottom: "1rem" }}>🔍</div>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
          404 - Page Not Found
        </h1>
        <p
          style={{
            fontSize: "1.25rem",
            color: "var(--ifm-color-emphasis-700)",
            maxWidth: "600px",
            marginBottom: "2rem",
          }}
        >
          Looks like this session ended unexpectedly. The page you're looking
          for doesn't exist or has been moved.
        </p>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Link className="button button--primary button--lg" to="/">
            Go Home
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro"
          >
            Read the Docs
          </Link>
        </div>
        <p
          style={{
            marginTop: "3rem",
            fontSize: "0.875rem",
            color: "var(--ifm-color-emphasis-600)",
          }}
        >
          Think something's broken?{" "}
          <Link to="https://github.com/josedab/agentops/issues">
            Open an issue
          </Link>
        </p>
      </main>
    </Layout>
  );
}
