export interface PayoutResult {
  success: boolean;
  reference: string;
}

// DI token — consumers inject this and are unaware of the implementation behind it.
export const PAYOUT_PROVIDER = 'PAYOUT_PROVIDER';

export interface PayoutProvider {
  withdraw(driverId: string, amount: number): Promise<PayoutResult>;
}
