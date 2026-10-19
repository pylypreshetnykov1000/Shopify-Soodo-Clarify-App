import { redirect } from "react-router";

// Content moved: drafts are on the Action plan, published changes on Performance.
export const loader = () => redirect("/app/fixes");
