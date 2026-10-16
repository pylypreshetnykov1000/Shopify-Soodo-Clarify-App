import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./styles/app.css";
import { LOGO_DATA_URI } from "./ui/common";

export default function App() {
  return (
    <html lang="en">
      <head>
        <title>Soodo GEO</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#1d5a44" />
        <link rel="icon" href={LOGO_DATA_URI} />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
