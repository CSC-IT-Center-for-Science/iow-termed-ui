import { Injectable } from '@angular/core';
import { Http, Response, RequestOptionsArgs, Headers } from '@angular/http';
import { Observable } from 'rxjs';

const username = 'admin';
const password = 'admin';

@Injectable()
export class TermedHttp {

  constructor(private http: Http) {
  }

  get(url: string, options?: RequestOptionsArgs): Observable<Response> {
    return this.http.get(url, this.authorize(options));
  }

  post(url: string, body: any, options?: RequestOptionsArgs): Observable<Response> {
    return this.http.post(url, body, this.authorize(options));
  }

  put(url: string, body: any, options?: RequestOptionsArgs): Observable<Response> {
    return this.http.put(url, body, this.authorize(options));
  }

  delete(url: string, options?: RequestOptionsArgs): Observable<Response> {
    return this.http.delete(url, this.authorize(options));
  }

  private authorize(options?: RequestOptionsArgs) {

    const opts = options || {};

    if (!opts.headers)  {
      opts.headers = new Headers();
    }

    if (!opts.headers.has('Authorization')) {
      opts.headers.append('Authorization', `Basic ${btoa(`${username}:${password}`)}`);
    }

    return opts;
  }
}