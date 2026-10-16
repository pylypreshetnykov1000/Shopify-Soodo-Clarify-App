import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { context } from "../services/context.server";
import { AppLink, Icon, Logo, type IconName } from "../ui/common";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await context(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    demo: ctx.demo,
    shop: ctx.shop,
  };
};

const NAV: { to: string; name: string; icon: IconName }[] = [
  { to: "/app", name: "Overview", icon: "grid" },
  { to: "/app/products", name: "Products", icon: "box" },
  { to: "/app/fixes", name: "Fix plan", icon: "list" },
  { to: "/app/history", name: "Change history", icon: "history" },
  { to: "/app/settings", name: "Settings", icon: "settings" },
];

export default function App() {
  const { apiKey, demo, shop } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  // Only page navigations show progress; quick ones never flash an indicator.
  const pending =
    navigation.state === "loading" && !navigation.formMethod
      ? navigation.location.key
      : null;
  const [slowKey, setSlowKey] = useState<string | null>(null);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlowKey(pending), 160);
    return () => clearTimeout(timer);
  }, [pending]);
  const slow = pending !== null && slowKey === pending;
  const section = NAV.find((item) =>
    item.to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(item.to),
  )?.to;
  const shell = (
    <div className={demo ? "app-shell" : "app-shell embedded-shell"}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {slow && (
        <div className="nav-progress" aria-hidden="true">
          <span />
        </div>
      )}
      <span className="navigation-status sr-only" role="status" aria-live="polite">
        {slow ? "Loading..." : ""}
      </span>
      <aside className="sidebar">
        <AppLink to="/app" className="brand" label="Soodo GEO home">
          <Logo />
          Soodo <span className="brand-tag">GEO</span>
        </AppLink>
        <nav aria-label="Main navigation">
          {NAV.map((item) => (
            <AppLink
              key={item.to}
              to={item.to}
              current={section === item.to}
              className={`nav-link${section === item.to ? " selected" : ""}`}
            >
              <Icon name={item.icon} size={16} />
              {item.name}
            </AppLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>{demo ? "Trail Supply" : shop.replace(".myshopify.com", "")}</strong>
          <span>
            <span className="status-dot" />
            {demo ? "Demo · changes stay local" : "Connected to Shopify"}
          </span>
        </div>
      </aside>
      <div className="workspace">
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="page" key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );

  return demo ? (
    shell
  ) : (
    <AppProvider apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Overview
        </a>
        <a href="/app/products">Products</a>
        <a href="/app/fixes">Fix plan</a>
        <a href="/app/history">Change history</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      {shell}
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
