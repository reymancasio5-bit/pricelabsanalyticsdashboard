/* Public reports: supplied contact details are not verified. Attachments stay in memory until submission. */
(function () {
  'use strict';
  function init(options) {
    function el(id) { return document.getElementById(id); }
    var dialog=el('report-dialog'), form=el('report-form'), status=el('report-status');
    var enabled=false, attachment=null, previewUrl='', sending=false, requestId='', page='', updated='', draft=null;
    function notice(text) {status.textContent=text;}
    function controls() {el('report-send').disabled=sending||!enabled;el('report-close').disabled=sending;el('report-remove').disabled=sending||!!draft;['report-name','report-email','report-summary','report-description','report-file'].forEach(function(id){el(id).disabled=sending||!!draft;});}
    function post(body) {
      var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},30000);
      // text/plain is a simple CORS request; never use no-cors and claim success blindly.
      return fetch(options.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),credentials:'omit',redirect:'follow',signal:controller.signal})
        .then(function(r){if(!r.ok)throw Error('The report service could not be reached.');return r.json();})
        .then(function(r){if(!r.ok){var error=Error(r.error||'The report was not accepted.');error.rejected=!r.uncertain;throw error;}return r;})
        .finally(function(){clearTimeout(timer);});
    }
    function setup() {
      notice('Checking report service...');var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
      var url=options.url+'?action=reportConfig'+(options.token?'&token='+encodeURIComponent(options.token):'');
      return fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal}).then(function(r){if(!r.ok)throw Error('Report service unavailable.');return r.json();}).then(function(r){
        if(!r.ok||!r.enabled||r.mode!=='public-tickets-v1')throw Error('Reporting is not enabled yet. The owner needs to update Apps Script. No Google sign-in is required for visitors.');
        enabled=true;notice('No sign-in needed. Your report will be saved as a ticket.');
      }).catch(function(error){enabled=false;notice(error.name==='AbortError'?'Report service timed out. Close and reopen this form to retry.':error.message);}).finally(function(){clearTimeout(timer);controls();});
    }
    function removeAttachment() {attachment=null;el('report-file').value='';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';el('report-image').removeAttribute('src');el('report-preview').hidden=true;}
    el('chat-report').addEventListener('click',function(){page=location.hash||'#/overview';updated=String(options.snapshot()||'Unknown').slice(0,150);el('report-context').textContent='Page: '+page+' · Snapshot: '+updated;dialog.showModal();if(!enabled)setup();el('report-summary').focus();});
    el('report-close').addEventListener('click',function(){if(!sending)dialog.close();});
    dialog.addEventListener('cancel',function(e){if(sending)e.preventDefault();});
    dialog.addEventListener('close',function(){el('chat-report').focus();});
    el('report-remove').addEventListener('click',removeAttachment);
    el('report-file').addEventListener('change',function(){
      var file=this.files[0];removeAttachment();if(!file)return;
      if(['image/png','image/jpeg'].indexOf(file.type)<0||file.size>2*1024*1024){notice('Choose a PNG or JPEG image up to 2 MB.');return;}
      attachment=file;previewUrl=URL.createObjectURL(file);el('report-image').src=previewUrl;el('report-preview').hidden=false;notice('Screenshot attached.');
    });
    function readAttachment(file) {return new Promise(function(resolve,reject){if(!file){resolve(null);return;}var reader=new FileReader();reader.onerror=function(){reject(Error('Could not read the screenshot. Please attach it again.'));};reader.onload=function(){resolve({type:file.type,base64:String(reader.result).split(',')[1]});};reader.readAsDataURL(file);});}
    form.addEventListener('submit',function(e){
      e.preventDefault();if(sending||!enabled||!form.reportValidity())return;
      sending=true;controls();notice('Sending your report...');
      if(!requestId)requestId=crypto.randomUUID();
      (draft?Promise.resolve(draft.attachment):readAttachment(attachment)).then(function(image){if(!draft)draft={action:'submitReport',requestId:requestId,name:el('report-name').value,email:el('report-email').value,website:el('report-website').value,title:el('report-summary').value,description:el('report-description').value,page:page,updated:updated,attachment:image};return post(draft);})
        .then(function(result){notice('Ticket saved in the Report tab. Reference: '+result.reportId+'. '+(result.emailStatus==='Sent'?'Email notification sent.':'Your ticket is saved even though email notification was not confirmed.'));requestId='';draft=null;form.reset();removeAttachment();})
        .catch(function(error){if(error.rejected){draft=null;requestId='';}notice((error.name==='AbortError'||error instanceof TypeError?'Delivery could not be confirmed. Retrying uses the same report ID to avoid duplicate tickets.':error.message)+' Reference: '+(requestId||'not submitted')+(draft?' Retry sends this same, unchanged report.':''));})
        .finally(function(){sending=false;controls();});
    });
    window.addEventListener('pagehide',function(){removeAttachment();});
  }
  window.PortfolioReports={init:init};
})();
