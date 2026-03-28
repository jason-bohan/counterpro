import { SignIn } from "@clerk/nextjs";

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 gap-4">
      <div className="text-center mb-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">CounterPro</p>
        <p className="font-bold text-lg">Admin Access</p>
      </div>
      <SignIn forceRedirectUrl="/admin" />
    </div>
  );
}
