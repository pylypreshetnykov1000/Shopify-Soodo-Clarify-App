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
import { AppLink, Icon } from "../ui/common";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await context(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    demo: ctx.demo,
    shop: ctx.shop,
  };
};

export default function App() {
  const { apiKey, demo, shop } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [slowNavigation, setSlowNavigation] = useState<typeof navigation>();
  useEffect(() => {
    if (navigation.state === "idle") return;
    const timer = setTimeout(() => setSlowNavigation(navigation), 180);
    return () => clearTimeout(timer);
  }, [navigation]);
  const showLoading =
    navigation.state !== "idle" && slowNavigation === navigation;
  const shell = (
    <div className={demo ? "app-shell" : "app-shell embedded-shell"}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <AppLink to="/app" className="brand">
          <span className="brand-mark">
            <Icon name="leaf" size={24} />
          </span>
          soodo<span className="brand-dot">.</span>
        </AppLink>
        <div className="sidebar-caption">Product information</div>
        <nav aria-label="Main navigation">
          {[
            { to: "/app", name: "Overview", icon: "grid" as const },
            { to: "/app/products", name: "Products", icon: "box" as const },
            {
              to: "/app/history",
              name: "Change history",
              icon: "history" as const,
            },
            {
              to: "/app/settings",
              name: "Settings",
              icon: "settings" as const,
            },
          ].map((item) => (
            <AppLink
              key={item.to}
              to={item.to}
              current={
                item.to === "/app"
                  ? pathname === item.to
                  : pathname.startsWith(item.to)
              }
              className={`nav-link ${(item.to === "/app" ? pathname === item.to : pathname.startsWith(item.to)) ? "selected" : ""}`}
            >
              <Icon name={item.icon} />
              {item.name}
            </AppLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          <div>
            <strong>
              {demo ? "Trail Supply" : shop.replace(".myshopify.com", "")}
            </strong>
            <small>{demo ? "Local demo store" : "Shopify connected"}</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="workspace-label">
            {demo ? "Trail Supply" : shop.replace(".myshopify.com", "")}
          </span>
          <div>
            <span
              className="navigation-status"
              role="status"
              aria-live="polite"
            >
              {showLoading ? "Loading..." : ""}
            </span>
            <span className="status-pill">
              {demo ? "Demo store" : "Shopify connected"}
            </span>
          </div>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>
          {demo && (
            <div className="demo-note">
              Demo store. Changes stay on this computer.
            </div>
          )}
          <Outlet />
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
