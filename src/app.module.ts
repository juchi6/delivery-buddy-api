import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CacheModule } from './common/cache/cache.module';
import { configValidationSchema } from './config/config.schema';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { DriversModule } from './drivers/drivers.module';
import { HealthModule } from './health/health.module';
import { ShiftsModule } from './shifts/shifts.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    PrismaModule,
    CacheModule,
    AuthModule,
    DriversModule,
    ShiftsModule,
    DeliveriesModule,
    HealthModule,
  ],
  providers: [
    // Apply JwtAuthGuard to every route; individual routes opt out via @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
