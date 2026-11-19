import { ProductLogo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/brand/showcase";
import { PRODUCT } from "@/config/product";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-12">
        <ProductLogo />
        <main className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[380px]">{children}</div>
        </main>
        <footer className="text-fg-subtle flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            {PRODUCT.name} {PRODUCT.byline}
          </span>
          <a href={`mailto:${PRODUCT.supportEmail}`} className="hover:text-fg">
            Precisa de ajuda?
          </a>
        </footer>
      </div>
      <div className="hidden p-3 lg:block">
        <AuthShowcase className="rounded-[20px]" />
      </div>
    </div>
  );
}
