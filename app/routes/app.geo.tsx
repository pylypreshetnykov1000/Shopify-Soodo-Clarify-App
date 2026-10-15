import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// GEO checks moved into the Fix plan and the product workspace.
export const loader = ({ request }: LoaderFunctionArgs) =>
  redirect(`/app/fixes${new URL(request.url).search}`);
