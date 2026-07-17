import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver } from '../common/decorators/current-driver.decorator';
import type { JwtPayload } from '../common/decorators/current-driver.decorator';
import { PaginatedTransactionsDto } from './dto/paginated-transactions.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { WalletSummaryDto } from './dto/wallet-summary.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { WithdrawResponseDto } from './dto/withdraw-response.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get wallet summary: balance (earnings + tips − withdrawals), level, commission rate' })
  @ApiResponse({ status: 200, type: WalletSummaryDto })
  getWalletSummary(@CurrentDriver() driver: JwtPayload): Promise<WalletSummaryDto> {
    return this.walletService.getWalletSummary(driver.sub);
  }

  @Get('me/transactions')
  @ApiOperation({ summary: 'Paginated transaction history, newest first' })
  @ApiResponse({ status: 200, type: PaginatedTransactionsDto })
  getTransactions(
    @CurrentDriver() driver: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedTransactionsDto> {
    return this.walletService.getTransactions(driver.sub, query);
  }

  @Post('me/withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Withdraw funds — mocked payout; returns 400 if amount exceeds current balance' })
  @ApiResponse({ status: 201, type: WithdrawResponseDto })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid amount' })
  withdraw(
    @CurrentDriver() driver: JwtPayload,
    @Body() dto: WithdrawDto,
  ): Promise<WithdrawResponseDto> {
    return this.walletService.withdraw(driver.sub, dto);
  }
}
