"use client";
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Tab error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "var(--red-light)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-md)",
            padding: "24px",
            color: "var(--red)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Something went wrong in this tab
          </div>
          <div style={{ fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: "var(--red)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
