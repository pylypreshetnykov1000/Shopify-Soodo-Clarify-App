import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const busy = useNavigation().state !== "idle";

  return (
    <main className="landing">
      <div className="brand">
        Soodo <span className="brand-tag">GEO</span>
      </div>
      <h1>Connect your store</h1>
      <p>Enter your Shopify store domain to continue.</p>
      <Form method="post">
        <label>
          Shopify store domain
          <input
            type="text"
            name="shop"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autoComplete="url"
            placeholder="your-store.myshopify.com"
            required
            aria-invalid={!!errors.shop}
            aria-describedby={errors.shop ? "shop-error" : undefined}
          />
        </label>
        {errors.shop && (
          <div className="notice error" id="shop-error" role="alert">
            {errors.shop}
          </div>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Connecting..." : "Log in"}
        </button>
      </Form>
    </main>
  );
}
