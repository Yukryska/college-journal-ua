type CollegeBrandProps = {
  variant?: "sidebar" | "mobile" | "standalone";
};

export default function CollegeBrand({ variant = "sidebar" }: CollegeBrandProps) {
  return (
    <span className={`college-identity college-identity--${variant}`}>
      <img
        className="college-logo"
        src="/brand/itcollege-logo.jpg"
        width={64}
        height={64}
        alt="Емблема ІТ коледжу Львівської політехніки"
      />
      <span className="college-wordmark">
        <strong>ІТ КОЛЕДЖ</strong>
        <span className="college-parent">Львівської політехніки</span>
        <span className="college-product">Електронний журнал</span>
      </span>
    </span>
  );
}
