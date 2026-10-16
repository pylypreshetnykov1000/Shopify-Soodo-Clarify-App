import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { seedDemo } from "../services/demo.server";
import {
  isProfileSetting,
  PROFILE_KEYS,
  PROFILES,
  rulesFor,
} from "../core/profiles";
import { AppLink, Badge, Notice, Spinner } from "../ui/common";

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, demo, missingScopes } = await context(request);
  if (demo) await seedDemo();
  const store = await ensureStore(shop);
  return { shop, demo, setting: store.category, missingScopes };
}
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await context(request);
  const form = await request.formData();
  const setting = form.get("profile");
  if (!isProfileSetting(setting))
    return { ok: false, message: "Choose a checklist." };
  await ensureStore(shop);
  await db.store.update({ where: { shop }, data: { category: setting } });
  return {
    ok: true,
    message:
      setting === "auto"
        ? "Saved. Each product now uses the checklist for its Shopify category."
        : `Saved. Every product now uses the ${PROFILES[setting].label.toLowerCase()} checklist.`,
  };
}

export default function Settings() {
  const { shop, demo, setting, missingScopes } = useLoaderData<typeof loader>();
  const grant = (scope: string) =>
    missingScopes.includes(scope) ? (
      <Badge tone="warning">Not approved yet</Badge>
    ) : (
      <Badge tone="success">Approved</Badge>
    );
  const result = useActionData<typeof action>();
  const saving = useNavigation().state === "submitting";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Checklist, permissions and how changes are published.</p>
        </div>
      </div>
      <Notice result={result} />
      <section className="settings-row" aria-labelledby="checklist-heading">
        <div>
          <h2 id="checklist-heading">Specification checklist</h2>
          <p>
            Which buyer facts each product should state. Automatic picks a checklist from the product’s
            Shopify category, and uses General when no category matches.
          </p>
        </div>
        <Form method="post" className="card card-body">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Checklist</legend>
            <div className="choice-list">
              <label className="choice" htmlFor="profile-auto" aria-label="Automatic">
                <input id="profile-auto" type="radio" name="profile" value="auto" defaultChecked={setting === "auto"} />
                <span>
                  <strong>Automatic</strong> <Badge tone="success">Recommended</Badge>
                  <small>Chosen per product from its Shopify category.</small>
                </span>
              </label>
              {PROFILE_KEYS.map((key) => (
                <label className="choice" key={key} htmlFor={`profile-${key}`} aria-label={PROFILES[key].label}>
                  <input id={`profile-${key}`} type="radio" name="profile" value={key} defaultChecked={setting === key} />
                  <span>
                    <strong>{PROFILES[key].label}</strong>
                    <small>{rulesFor(key).map((r) => r.label).join(" · ")}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ marginTop: 14 }}>
            <button className="button primary" disabled={saving} aria-busy={saving}>
              {saving && <Spinner />}
              Save checklist
            </button>
          </div>
        </Form>
      </section>
      <section className="settings-row" aria-labelledby="store-heading">
        <div>
          <h2 id="store-heading">Store and permissions</h2>
          <p>Soodo asks only for what the checks need.</p>
        </div>
        <div className="card card-body">
          <dl className="definition">
            <div>
              <dt>Store</dt>
              <dd>
                {demo ? "Trail Supply (local demo)" : shop}{" "}
                <Badge tone={demo ? "neutral" : "success"}>{demo ? "Demo" : "Connected"}</Badge>
              </dd>
            </div>
            <div>
              <dt>Products</dt>
              <dd>Read products, variants and categories. Write descriptions you approve.</dd>
            </div>
            <div>
              <dt>Category values</dt>
              <dd>
                Read category attribute values such as color and material (metaobjects). {grant("read_metaobjects")}
              </dd>
            </div>
            <div>
              <dt>Store policies</dt>
              <dd>
                Read refund, shipping, privacy and contact policies. {grant("read_legal_policies")}
              </dd>
            </div>
            <div>
              <dt>Live pages</dt>
              <dd>
                Loads public product pages and robots.txt over HTTPS only, the same way a crawler would.
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="settings-row" aria-labelledby="publishing-heading">
        <div>
          <h2 id="publishing-heading">Publishing</h2>
          <p>How description changes reach your store.</p>
        </div>
        <div className="card card-body">
          <dl className="definition">
            <div>
              <dt>Approval</dt>
              <dd>Required for every description change.</dd>
            </div>
            <div>
              <dt>Your content</dt>
              <dd>Kept. Specifications are added as one list at the end of the description.</dd>
            </div>
            <div>
              <dt>Safety checks</dt>
              <dd>
                The product is read again before publishing; if it changed, the draft is stopped. Every write is
                verified afterwards.
              </dd>
            </div>
            <div>
              <dt>Undo</dt>
              <dd>
                Restore any previous description from{" "}
                <AppLink to="/app/history" className="text-link">
                  Change history
                </AppLink>
                .
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="settings-row" aria-labelledby="about-heading">
        <div>
          <h2 id="about-heading">About the checks</h2>
          <p>What readiness means.</p>
        </div>
        <div className="card card-body">
          <p style={{ fontSize: 13 }}>
            Readiness weights each check by priority (high 3, medium 2, low 1) and counts only checks that could
            be run. Priorities follow published guidance from Google, Shopify and AI search providers: crawlable
            pages, accurate structured data, complete product attributes and clear facts. They are not measured
            ranking factors, and a full score does not guarantee placement in any search or AI answer.
          </p>
        </div>
      </section>
    </>
  );
}
