export function shouldConfirmOnlineOrder(input: {
  paymentStatus: string;
  orderStatus: string;
  alreadySent: boolean;
}): boolean {
  return input.paymentStatus === "paid"
    && input.orderStatus !== "cancelled"
    && input.orderStatus !== "rejected"
    && !input.alreadySent;
}
