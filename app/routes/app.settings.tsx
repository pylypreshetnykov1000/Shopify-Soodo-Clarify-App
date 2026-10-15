import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { RULES } from "../core/catalog";
import { AppLink, Badge } from "../ui/common";
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, demo } = await context(request);
  return { shop, demo };
}
export default function Settings() {
  const { shop, demo } = useLoaderData<typeof loader>();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Store connection and product checklist.</p>
        </div>
      </div>
      <div className="settings-sections">
        <section className="settings-row">
          <div>
            <h2>Store</h2>
            <p>The store this workspace uses.</p>
          </div>
          <div className="card padded">
            <div className="connection-heading">
              <strong>{demo ? "Trail Supply" : shop}</strong>
              <Badge tone={demo ? "neutral" : "success"}>
                {demo ? "Local demo" : "Connected"}
              </Badge>
            </div>
            <p>
              {demo
                ? "Changes are saved on this computer. No Shopify store is updated."
                : "The app reads product information and updates approved descriptions. Manage granted permissions in Shopify."}
            </p>
          </div>
        </section>
        <section className="settings-row">
          <div>
            <h2>Publishing</h2>
            <p>How description changes are applied.</p>
          </div>
          <div className="card padded">
            <dl className="setting-list">
              <div>
                <dt>Approval</dt>
                <dd>Required for every description update</dd>
              </div>
              <div>
                <dt>Original content</dt>
                <dd>Kept when specifications are added</dd>
              </div>
              <div>
                <dt>Recovery</dt>
                <dd>
                  Previous descriptions saved in{" "}
                  <AppLink to="/app/history" className="text-link">
                    Change history
                  </AppLink>
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="settings-row">
          <div>
            <h2>Outdoor gear checklist</h2>
            <p>Five details, each worth 20% of the completeness score.</p>
          </div>
          <div className="card padded">
            <p className="settings-intro">
              Values are read from explicit description labels and supported
              metafields. Unknown details stay empty.
            </p>
            {RULES.map((rule) => (
              <div className="rule" key={rule.key}>
                <strong>{rule.label}</strong>
                <small>{rule.hint}</small>
              </div>
            ))}
            <details className="help-details">
              <summary>How missing and conflicting details are handled</summary>
              <p>
                A missing field may exist in unlabelled product text. Add an
                explicit, verified value to include it in the checklist.
                Conflicting source values must be corrected in Shopify before
                creating a draft.
              </p>
            </details>
          </div>
        </section>
        <section className="settings-row">
          <div>
            <h2>Catalog scans</h2>
            <p>Keeping your workspace up to date.</p>
          </div>
          <div className="card padded">
            <p>
              Select Scan catalog after updating products in Shopify. Large
              catalogs import in batches; Continue scan resumes the next batch.
            </p>
            <p>
              Products are checked again before drafting, publishing, or
              restoring. If a publish result is unclear,{" "}
              <AppLink to="/app/history" className="text-link">
                Change history
              </AppLink>{" "}
              shows the operation to verify.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
