import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponseBody {
  code: number;
  message: string;
  data: any;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        // Handle class-validator errors (array of messages)
        if (Array.isArray(resp.message)) {
          message = resp.message.join('; ');
        } else {
          message = resp.message || exception.message;
        }
      } else {
        message = exception.message;
      }
    } else if (
      exception instanceof Error &&
      typeof (exception as any).status === 'number' &&
      (exception as any).status >= 400 &&
      (exception as any).status < 500
    ) {
      // body-parser 等中间件抛的客户端错误（请求体过大 413、JSON 格式错误
      // 400）自带 status，不是服务器故障，按原状态码返回
      status = (exception as any).status;
      message =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? '提交的内容过大（邮件正文不能超过 30MB，大文件请作为附件上传）'
          : status === HttpStatus.BAD_REQUEST
            ? '请求格式错误'
            : exception.message;
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '服务器内部错误';
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '服务器内部错误';
      this.logger.error(`Unknown exception: ${JSON.stringify(exception)}`);
    }

    const body: ExceptionResponseBody = {
      code: status,
      message,
      data: null,
    };

    this.logger.warn(
      `${request.method} ${request.url} ${status} - ${message}`,
    );

    response.status(status).json(body);
  }
}
