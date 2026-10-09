"""Text-only HTML ingestion: never executes scripts or fetches referenced assets."""
import re
from html.parser import HTMLParser

class Reader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript','template'):self.skip+=1
        if not self.skip and tag in ('p','div','br','li','tr','h1','h2','h3','h4','h5','h6','hr'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript','template'):self.skip=max(0,self.skip-1)
        if not self.skip and tag in ('p','div','li','tr','h1','h2','h3','h4','h5','h6'):self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def html_pages(raw):
    reader=Reader();reader.feed(raw.decode('utf-8-sig'))
    text='\n'.join(line for line in (re.sub(r'[\t\r\f\v ]+',' ',line).strip() for line in ''.join(reader.parts).splitlines()) if line)
    if len(text)>2_000_000:raise ValueError('HTML text exceeds 2 million characters; import relevant sections as a separate evidence document')
    pages=[]; current=[];size=0
    for line in text.splitlines():
        if size+len(line)>20_000 and current:pages.append('\n'.join(current));current=[];size=0
        current.append(line);size+=len(line)+1
    if current:pages.append('\n'.join(current))
    return pages
