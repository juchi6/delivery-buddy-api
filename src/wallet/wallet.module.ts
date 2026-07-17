import { Module } from '@nestjs/common';
import { MockPayoutProvider } from './providers/mock.payout.provider';
import { PAYOUT_PROVIDER } from './providers/payout.provider';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletRepository,
    // Register MockPayoutProvider as a named class so e2e tests can spy on it.
    MockPayoutProvider,
    // Expose the same instance under the interface token so the service is
    // unaware it is talking to a mock.
    { provide: PAYOUT_PROVIDER, useExisting: MockPayoutProvider },
  ],
})
export class WalletModule {}
