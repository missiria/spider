import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Logger,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UsersService } from '../users/users.service';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser } from './jwt.strategy';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Ip() ip: string) {
    try {
      const res = await this.auth.login(body.email, body.password);
      this.logger.log(`login ok user=${res.user.id} ip=${ip}`);
      return res;
    } catch (err) {
      this.logger.warn(`login failed email=${body.email} ip=${ip}`);
      throw err;
    }
  }

  @Get('me')
  async me(@Req() req: { user: AuthUser }) {
    const user = await this.users.findById(req.user.userId);
    return user ? this.users.toPublic(user) : req.user;
  }

  @Patch('me')
  async updateMe(@Req() req: { user: AuthUser }, @Body() body: UpdateMeDto) {
    const user = await this.users.updateProfile(req.user.userId, body);
    return this.users.toPublic(user);
  }
}
