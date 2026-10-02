"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type AuthState } from "@/app/(auth)/actions";
import { FormMessage } from "@/components/auth/form-message";
import { GoogleButton } from "@/components/auth/google-button";
import { SubmitButton } from "@/components/auth/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Create account</CardTitle>
        <CardDescription>
          You&rsquo;ll join a league with an invite code after this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton label="Sign up with Google" />
        <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
          <span className="bg-border h-px flex-1" />
          or
          <span className="bg-border h-px flex-1" />
        </div>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="nickname"
              minLength={2}
              maxLength={32}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <FormMessage state={state} />
          <SubmitButton className="w-full" pendingText="Creating account…">
            Create account
          </SubmitButton>
        </form>
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
