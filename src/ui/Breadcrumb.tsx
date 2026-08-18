export type BreadcrumbItem = { label: string };

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="eg-crumbs" aria-label="Ruta">
      {items.map((item, index) => (
        <span className="eg-crumbs__item" key={`${item.label}-${index}`}>
          {index > 0 && <span className="eg-crumbs__sep" aria-hidden="true">/</span>}
          <span className={index === items.length - 1 ? "eg-crumbs__current" : "eg-crumbs__link"}>
            {item.label}
          </span>
        </span>
      ))}
    </nav>
  );
}
