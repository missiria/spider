import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { EmailBrandGuard } from './email-brand.guard';
import { AuthUser } from '../../auth/jwt.strategy';
import { MailerService } from '../mailer.service';
import { EmailBrandService } from './email-brand.service';
import { EMAIL_SAMPLES, SAMPLE_LINK_ORIGIN, renderEmail } from './layout';

export class EmailBrandDto {
  @IsString() @MaxLength(80) @Matches(/\S/) name: string;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/[^/?#@]+(?:[/?#]|$)/)
  @MaxLength(1000)
  logoUrl: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) accentColor: string;
  @IsEmail() @MaxLength(254) supportEmail: string;
  @IsString() @MaxLength(160) company: string;
  @IsString() @MaxLength(500) footer: string;
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/[^/?#@]+(?:[/?#]|$)/)
  @MaxLength(1000)
  websiteUrl: string;
}

@UseGuards(EmailBrandGuard)
@Controller('admin/email-brand')
export class EmailBrandController {
  constructor(
    private readonly brands: EmailBrandService,
    private readonly mailer: MailerService,
  ) {}
  @Get() settings() {
    return this.brands.settings();
  }
  @Post('draft') draft(
    @Body() body: EmailBrandDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.brands.saveDraft(body, req.user.userId);
  }
  @Post('publish/:id') publish(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthUser },
  ) {
    return this.brands.publish(id, req.user.userId);
  }

  private sample(key = 'confirmation') {
    if (!Object.prototype.hasOwnProperty.call(EMAIL_SAMPLES, key))
      throw new BadRequestException('Unknown email preview');
    return EMAIL_SAMPLES[key as keyof typeof EMAIL_SAMPLES];
  }
  @Post('preview') preview(
    @Body() body: EmailBrandDto,
    @Query('template') key?: string,
  ) {
    const sample = this.sample(key);
    return renderEmail(body, sample.subject, sample.text, SAMPLE_LINK_ORIGIN);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('test')
  async test(
    @Body() body: EmailBrandDto,
    @Query('template') key: string | undefined,
    @Req() req: { user: AuthUser },
  ) {
    const sample = this.sample(key);
    const result = await this.mailer.send(
      { to: [req.user.email], subject: sample.subject, text: sample.text },
      body,
    );
    return { sent: !result.skipped, to: req.user.email };
  }
}
