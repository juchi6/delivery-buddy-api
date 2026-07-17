import { Injectable } from '@nestjs/common';
import type { PayoutProvider, PayoutResult } from './payout.provider';

// Production replacement: inject ConfigService, call Stripe Connect payouts (or similar)
// behind this same interface with the API key sourced from config.
// A real withdrawal would decrement the ledger AND initiate a bank transfer/PayPal payout.

@Injectable()
export class MockPayoutProvider implements PayoutProvider {
  withdraw(driverId: string, amount: number): Promise<PayoutResult> {
    // Deterministic-ish reference for traceability in test logs.
    const reference = `mock-payout-${driverId.slice(-6)}-${amount.toFixed(2).replace('.', '')}-${Date.now()}`;
    return Promise.resolve({ success: true, reference });
  }
}
