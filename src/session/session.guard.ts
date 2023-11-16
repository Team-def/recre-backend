import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const payload = context.switchToWs().getData();
    const client = context.switchToWs().getClient();
    client.user = "hello world";
    // console.log(request);
    console.log("가자: ",payload);
    // if (!session) {
    //   return false;
    // }
    return true;
  }
}
