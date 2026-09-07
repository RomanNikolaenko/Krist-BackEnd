import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class WriteReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  /**
   * Long enough to say something, bounded so one review cannot be a novel —
   * and so the column has a size the page layout was designed for.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  body!: string;
}
