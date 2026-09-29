import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-2xl font-semibold tracking-tight">
        Pick-Em
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
