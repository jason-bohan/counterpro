"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@clerk/nextjs";

interface NeonQueryResult {
  rows: Record<string, unknown>[];
  columns: Array<{ name: string; type: string }>;
  time: number;
}

interface QuickQuery {
  name: string;
  query: string;
}

export default function NeonAdminPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [query, setQuery] = useState("SELECT * FROM negotiations ORDER BY created_at DESC LIMIT 5");
  const [results, setResults] = useState<NeonQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only allow admin users (you can customize this)
  // Note: You'll need to get user email from Clerk user object
  const isAdmin = true; // Simplified for now - you can enhance this

  const runQuery = async () => {
    if (!isAdmin) {
      setError("Access denied. Admin only.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/neon-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Query failed");
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  const quickQueries: QuickQuery[] = [
    {
      name: "Recent Negotiations",
      query: "SELECT * FROM negotiations ORDER BY created_at DESC LIMIT 5"
    },
    {
      name: "Sales+neg8 Messages",
      query: "SELECT * FROM negotiations WHERE alias_email = 'sales+neg8@counterproai.com'"
    },
    {
      name: "Recent Messages",
      query: "SELECT nm.*, n.address FROM negotiation_messages nm JOIN negotiations n ON nm.negotiation_id = n.id ORDER BY nm.created_at DESC LIMIT 5"
    },
    {
      name: "Webhook Logs",
      query: "SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 10"
    }
  ];

  if (!isLoaded || !isSignedIn || !isAdmin) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Admin access required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Neon Database Admin</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Query Editor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Quick Queries:</label>
              <div className="flex flex-wrap gap-2">
                {quickQueries.map((qq) => (
                  <Button
                    key={qq.name}
                    variant="outline"
                    size="sm"
                    onClick={() => setQuery(qq.query)}
                  >
                    {qq.name}
                  </Button>
                ))}
              </div>
            </div>
            
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-32 p-3 border rounded-md font-mono text-sm"
              placeholder="Enter SQL query..."
            />
            
            <Button onClick={runQuery} disabled={loading}>
              {loading ? "Running..." : "Run Query"}
            </Button>
            
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {results && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Results
                <Badge variant="secondary">{results.rows.length} rows</Badge>
                <Badge variant="outline">{results.time}ms</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      {results.columns.map((col) => (
                        <th key={col.name} className="text-left p-2 font-medium text-sm">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        {results.columns.map((col) => (
                          <td key={col.name} className="p-2 text-sm font-mono">
                            {row[col.name] === null ? (
                              <span className="text-muted-foreground">NULL</span>
                            ) : (
                              String(row[col.name])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
