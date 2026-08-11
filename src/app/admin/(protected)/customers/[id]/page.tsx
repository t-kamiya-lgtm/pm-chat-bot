import { notFound, redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { getCustomerDetail } from "@/lib/customer-detail";
import { CustomerDetailView } from "@/components/admin/CustomerDetailView";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentAppUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin" && user.role !== "staff") redirect("/admin");

  const detail = await getCustomerDetail(id, { role: user.role, email: user.email });
  if (!detail) notFound();

  return (
    <div>
      <CustomerDetailView customer={detail.customer} orders={detail.orders} isAdmin={user.role === "admin"} />
    </div>
  );
}
