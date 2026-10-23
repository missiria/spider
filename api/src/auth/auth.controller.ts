import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UsersService } from '../users/users.service';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser } from './jwt.strategy';
import { ClientIp } from './client-ip.throttler.guard';
import { SignupService } from './signup.service';

/** 10+ chars with a letter and a digit; 72 = bcrypt's input limit */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,72}$/;
const PASSWORD_MESSAGE =
  'Password must be 10 to 72 characters with at least one letter and one digit';

const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;
const NO_CONTROL_CHARS_MESSAGE = 'Must be a single line of text';

class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  name: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
  company?: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

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
  @Matches(NO_CONTROL_CHARS, { message: NO_CONTROL_CHARS_MESSAGE })
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
    private readonly signup: SignupService,
  ) {}

  /** Always the same answer: whether the email already exists is not disclosed. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(202)
  async register(@Body() body: RegisterDto, @ClientIp() ip: string) {
    this.logger.log(`register attempt ip=${ip}`);
    await this.signup.register(body);
    return { status: 'pending' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: VerifyEmailDto) {
    await this.signup.verifyEmail(body.token, body.password);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @ClientIp() ip: string,
  ) {
    this.logger.log(`forgot-password ip=${ip}`);
    await this.signup.requestPasswordReset(body.email);
    return { status: 'sent' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() body: ResetPasswordDto) {
    const email = await this.signup.resetPassword(body.token, body.password);
    this.auth.clearFailures(email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @ClientIp() ip: string) {
    try {
      const res = await this.auth.login(body.email, body.password, ip);
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

  /** "Sign out everywhere": every token issued so far for this account stops working. */
  @Post('revoke-sessions')
  @HttpCode(204)
  async revokeSessions(@Req() req: { user: AuthUser }) {
    const user = await this.users.findById(req.user.userId);
    if (user) await this.users.revokeSessions(user);
  }
}
