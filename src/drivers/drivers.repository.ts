import { Injectable } from '@nestjs/common';
import { Prisma, Team, TransportationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DriverWithTeam = Prisma.DriverGetPayload<{ include: { team: true } }>;

export interface OnboardingData {
  workId?: string;
  firstName?: string;
  lastName?: string;
  teamId?: string;
  transportationType?: TransportationType;
  vehicleNumber?: string;
}

export interface ProfileData {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
}

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<DriverWithTeam | null> {
    return this.prisma.driver.findUnique({
      where: { id },
      include: { team: true },
    });
  }

  /** Check if another driver already holds this workId (used to detect conflicts on update). */
  findByWorkId(workId: string, excludeId: string): Promise<DriverWithTeam | null> {
    return this.prisma.driver.findFirst({
      where: { workId, NOT: { id: excludeId } },
      include: { team: true },
    });
  }

  updateDriver(id: string, data: OnboardingData | ProfileData): Promise<DriverWithTeam> {
    return this.prisma.driver.update({
      where: { id },
      // Cast needed: Prisma.DriverUncheckedUpdateInput accepts scalar FK fields directly
      data: data as Prisma.DriverUncheckedUpdateInput,
      include: { team: true },
    });
  }

  findAllTeams(): Promise<Team[]> {
    return this.prisma.team.findMany({ orderBy: { name: 'asc' } });
  }

  findTeamById(id: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id } });
  }
}
