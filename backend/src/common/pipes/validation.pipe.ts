import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  private readonly logger = new Logger(CustomValidationPipe.name);

  private readonly defaultMessages: Record<string, string> = {
    isNotEmpty: '$property 不能为空',
    isString: '$property 必须是字符串',
    isNumber: '$property 必须是数字',
    isInt: '$property 必须是整数',
    isEmail: '$property 必须是有效的邮箱地址',
    isBoolean: '$property 必须是布尔值',
    isDate: '$property 必须是有效的日期',
    isArray: '$property 必须是数组',
    isEnum: '$property 的值不在允许范围内',
    isUUID: '$property 必须是有效的UUID',
    isUrl: '$property 必须是有效的URL地址',
    isPhoneNumber: '$property 必须是有效的手机号码',
    min: '$property 不能小于 $constraint1',
    max: '$property 不能大于 $constraint1',
    minLength: '$property 长度不能少于 $constraint1 个字符',
    maxLength: '$property 长度不能超过 $constraint1 个字符',
    matches: '$property 格式不正确',
    isPositive: '$property 必须是正数',
    isNegative: '$property 必须是负数',
    arrayMinSize: '$property 至少需要 $constraint1 个元素',
    arrayMaxSize: '$property 最多允许 $constraint1 个元素',
    isIn: '$property 的值必须是以下之一: $constraint1',
    isOptional: '$property 是可选的',
    isDateString: '$property 必须是有效的日期字符串',
    isNumberString: '$property 必须是数字字符串',
    length: '$property 长度必须在 $constraint1 到 $constraint2 之间',
  };

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    });

    if (errors.length > 0) {
      const messages = this.buildErrorMessages(errors);
      throw new BadRequestException(messages.join('; '));
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private buildErrorMessages(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        for (const [key, value] of Object.entries(error.constraints)) {
          const chineseTemplate = this.defaultMessages[key];
          if (chineseTemplate) {
            let message = chineseTemplate.replace('$property', error.property);
            // Replace constraint placeholders
            if (error.contexts?.[key]) {
              const context = error.contexts[key];
              Object.entries(context).forEach(([k, v]) => {
                message = message.replace(`$${k}`, String(v));
              });
            }
            // Replace constraint values from the constraint metadata
            const constraintValues = this.extractConstraints(error, key);
            constraintValues.forEach((val, index) => {
              message = message.replace(`$constraint${index + 1}`, String(val));
            });
            messages.push(message);
          } else {
            // Fallback: use the original English message
            messages.push(value);
          }
        }
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const childMessages = this.buildErrorMessages(error.children);
        messages.push(...childMessages);
      }
    }

    return messages;
  }

  private extractConstraints(
    error: ValidationError,
    constraintKey: string,
  ): any[] {
    const constraints: any[] = [];

    try {
      // Extract constraint values based on common patterns
      switch (constraintKey) {
        case 'min':
        case 'max':
        case 'minLength':
        case 'maxLength':
        case 'arrayMinSize':
        case 'arrayMaxSize': {
          const match = error.constraints[constraintKey].match(/\d+/);
          if (match) constraints.push(match[0]);
          break;
        }
        case 'length': {
          const matches = error.constraints[constraintKey].match(/\d+/g);
          if (matches) constraints.push(...matches);
          break;
        }
        case 'isIn': {
          const inMatch = error.constraints[constraintKey].match(
            /following values: (.+)/,
          );
          if (inMatch) constraints.push(inMatch[1]);
          break;
        }
        default:
          break;
      }
    } catch {
      // Silently handle constraint extraction failures
    }

    return constraints;
  }
}
