package kr.co.ibk.aihub.api.common.util;


import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.httpclient.DefaultHttpMethodRetryHandler;
import org.apache.commons.httpclient.HttpClient;
import org.apache.commons.httpclient.HttpStatus;
import org.apache.commons.httpclient.methods.PostMethod;
import org.apache.commons.httpclient.params.HttpMethodParams;
import org.apache.http.HttpResponse;
import org.apache.http.client.methods.HttpPatch;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

@Slf4j
@Component
public class AlarmCall {

    @Value("${alarm.url}")
    private String alarmUrl;

    @Value("${alarm.srvCode}")
    private String srvCode;

    @Value("${prd.mode}")
    private Boolean prdMode;

    @Value("${n8nWebhook.url}")
    private String n8nWebhookUrl;

    @Value("${n8nWebhook.token}")
    private String n8nWebhookToken;

    @Async
    public void call(String recipient, String send, String title, String body, String linkTxt, String linkUrl) {

        if (prdMode) {
            HttpClient httpClient = new HttpClient();
            httpClient.getParams().setParameter(HttpMethodParams.RETRY_HANDLER, new DefaultHttpMethodRetryHandler());

            httpClient.getHttpConnectionManager().getParams().setConnectionTimeout(5000);

            PostMethod postMethod = new PostMethod(alarmUrl);

            if (recipient.startsWith("0")) {
                recipient = recipient.substring(1);
            }

            if (send.startsWith("0")) {
                send = send.substring(1);
            }

            postMethod.addParameter("SRV_CODE", srvCode);
            postMethod.addParameter("RECIPIENT", "E:" + recipient);
            postMethod.addParameter("SEND", send);
            postMethod.addParameter("TITLE", title);
            postMethod.addParameter("BODY", body);
            postMethod.addParameter("LINKTXT", linkTxt);
            postMethod.addParameter("LINKURL", linkUrl);

            postMethod.setRequestHeader("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");
            log.debug("AlarmCall url = {}", alarmUrl);
            log.debug("AlarmCall recipient = {}", recipient);
            log.debug("AlarmCall send = {}", send);
            log.debug("AlarmCall title = {}", title);
            log.debug("AlarmCall body = {}", body);
            log.debug("AlarmCall linkTxt = {}", linkTxt);
            log.debug("AlarmCall linkUrl = {}", linkUrl);
            try {
                int returnCode = httpClient.executeMethod(postMethod);
                if (returnCode != HttpStatus.SC_OK) {
                    log.error("alarm failed: {}", postMethod.getStatusLine());
                }
                String returnVal = postMethod.getResponseBodyAsString();
                log.debug("AlarmCall returnVal = {}", returnVal);
            } catch (IOException e) {
                log.error("AlamCall: {}", e.getLocalizedMessage());
            } finally {
                postMethod.releaseConnection();
            }
        }
    }
    @Async
    public void n8nCall(Map<String, String> result){

        CloseableHttpClient httpClient = HttpClients.createDefault();
        HttpPatch patch = new HttpPatch(n8nWebhookUrl);
        try {
            ObjectMapper mapper = new ObjectMapper();
            String json = mapper.writeValueAsString(result);
            patch.setHeader("Authorization","Basic "+ n8nWebhookToken);
            patch.setHeader("Content-Type","application/json; charset=UTF-8");
            patch.setEntity(new StringEntity(json, "UTF-8"));

            HttpResponse response = httpClient.execute(patch);
            if (response.getStatusLine().getStatusCode() != HttpStatus.SC_OK) {
                log.error("n8nCall failed: {}", response.getStatusLine());
            }
            String returnVal = response.getEntity().getContent().toString();
            log.debug("n8nCall returnVal = {}", returnVal);
        } catch (IOException e) {
            log.error("n8nCall: {}", e.getLocalizedMessage());
        } finally {
            patch.releaseConnection();
        }
    }
}
