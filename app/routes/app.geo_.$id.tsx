import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = ({ request, params }: LoaderFunctionArgs) =>
  redirect(`/app/products/${params.id}${new URL(request.url).search}`);
