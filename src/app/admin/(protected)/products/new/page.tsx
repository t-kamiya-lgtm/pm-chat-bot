import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品を登録</h1>
      <ProductForm />
    </div>
  );
}
