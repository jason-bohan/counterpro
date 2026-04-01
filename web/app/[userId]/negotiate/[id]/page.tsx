"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function UserNegotiationPage() {
  const { userId: paramUserId, id } = useParams();
  const { user } = useUser();
  const router = useRouter();

  // Redirect to the original negotiation page with validated user
  useEffect(() => {
    if (user?.id === paramUserId && id) {
      router.replace(`/negotiate/${id}`);
    }
  }, [user, paramUserId, id, router]);

  // Validate that the URL userId matches the authenticated user
  if (!user || user.id !== paramUserId) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don&apos;t have permission to view this negotiation.
          </p>
          <Button onClick={() => router.push("/negotiate")}>
            Back to Negotiations
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center">
      <div className="text-muted-foreground">Loading negotiation...</div>
    </div>
  );
}
