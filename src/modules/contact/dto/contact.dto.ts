import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactMessageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'A reply needs a valid address' })
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(10, { message: 'Tell us a little more than that' })
  @MaxLength(5000)
  message!: string;
}

export class SubscribeDto {
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(200)
  email!: string;
}
