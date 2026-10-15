import { useLoaderData } from "react-router";
import { CatalogView } from "../ui/catalog-view";
import { loader, action } from "./app._index";
export { loader, action };
export default function Products() { return <CatalogView data={useLoaderData<typeof loader>()} />; }
