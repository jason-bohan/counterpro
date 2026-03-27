"use client";

import { UserButton } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary"/>
              <path d="M16 5L5 14h3v13h8v-8h4v8h4V14h3L16 5z" fill="white"/>
            </svg>
            <span className="font-bold text-lg">CounterPro</span>
          </div>
          <div className="flex items-center gap-4">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">Ready to negotiate your next deal?</p>
        </div>

        {/* Start new deal */}
        <Card className="border-2 border-primary mb-8">
          <CardHeader>
            <CardTitle>Start a new negotiation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm max-w-md">
              Enter your deal details and get a complete counter-offer strategy, email scripts, and verbal scripts in minutes.
            </p>
            <Link href="/deal">
              <Button size="lg" className="shrink-0">New deal →</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Pricing reminder */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <Badge variant="outline" className="w-fit">Single deal</Badge>
              <CardTitle className="text-2xl mt-2">$50</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">One negotiation package. Full strategy, scripts, and analysis.</p>
              <Link href="/deal">
                <Button className="w-full" variant="outline">Get package</Button>
              </Link>
            </CardContent>
          </Card>
          <Card className="border-primary border-2">
            <CardHeader className="pb-2">
              <Badge className="w-fit">Best value</Badge>
              <CardTitle className="text-2xl mt-2">$100<span className="text-base font-normal text-muted-foreground">/mo</span></CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Unlimited deals per month. Ideal for investors and frequent buyers/sellers.</p>
              <Button className="w-full">Subscribe</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
