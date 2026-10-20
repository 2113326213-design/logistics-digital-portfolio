// A small, dependency-free XML DOMParser for Node, so public/xlsx.mjs readXlsx runs outside the browser.
//
// It covers the XML that .xlsx packages contain: namespace prefixes (<x:row>), self-closing elements,
// single- or double-quoted attributes, the five predefined entities, decimal and hexadecimal character
// references, CDATA sections, comments, processing instructions, the XML declaration and a DOCTYPE
// (custom entity definitions are not supported). It is not a validating parser.
//
// The DOM surface is what readXlsx needs, plus a few read-only conveniences: getElementsByTagName,
// getElementsByTagNameNS (with '*' wildcards), getAttribute, getAttributeNS, hasAttribute, textContent,
// parentNode, childNodes, children, localName, prefix, namespaceURI, tagName and documentElement.
// Collections are plain arrays (the browser returns live collections; readXlsx only iterates them).
//
// Like a browser DOMParser, malformed XML does not throw: the returned document's root element is
// <parsererror>, whose text gives the line, column and reason. readXlsx checks for that element.

const XML_NS='http://www.w3.org/XML/1998/namespace';
const XMLNS_NS='http://www.w3.org/2000/xmlns/';
const NAMED_ENTITIES={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"};
const NAME_START='A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME_CHAR=NAME_START+'\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const NCNAME=`[${NAME_START}][${NAME_CHAR}]*`;
// A namespace-aware name has at most one colon (prefix:local), as in browsers.
const QNAME=new RegExp(`${NCNAME}(?::${NCNAME})?`,'y');
const isSpace=char=>char===' '||char==='\n'||char==='\t'||char==='\r';

class XmlParseError extends Error{
 constructor(message,index){super(message);this.index=index;}
}

class XmlNode{
 constructor(nodeType,nodeName){this.nodeType=nodeType;this.nodeName=nodeName;this.parentNode=null;this.childNodes=[];}
 get firstChild(){return this.childNodes[0]??null;}
 get lastChild(){return this.childNodes.at(-1)??null;}
 get children(){return this.childNodes.filter(node=>node.nodeType===1);}
 get firstElementChild(){return this.children[0]??null;}
 // Descendant elements in document order, like the DOM methods of the same name.
 getElementsByTagName(qualifiedName){return descendants(this,element=>qualifiedName==='*'||element.tagName===qualifiedName);}
 getElementsByTagNameNS(namespace,localName){
  const ns=namespace===''?null:namespace;
  return descendants(this,element=>(namespace==='*'||element.namespaceURI===ns)&&(localName==='*'||element.localName===localName));
 }
}
function descendants(root,match){
 const found=[],stack=[...root.childNodes].reverse();
 while(stack.length){
  const node=stack.pop();if(node.nodeType!==1)continue;
  if(match(node))found.push(node);
  for(let i=node.childNodes.length-1;i>=0;i--)stack.push(node.childNodes[i]);
 }
 return found;
}

class XmlText extends XmlNode{
 constructor(data,cdata=false){super(cdata?4:3,cdata?'#cdata-section':'#text');this.data=data;}
 get nodeValue(){return this.data;}
 get textContent(){return this.data;}
}

class XmlElement extends XmlNode{
 constructor(qualifiedName,prefix,localName,namespaceURI,attributes){
  super(1,qualifiedName);this.tagName=qualifiedName;this.prefix=prefix;this.localName=localName;this.namespaceURI=namespaceURI;this.attributes=attributes;
 }
 getAttribute(qualifiedName){return this.attributes.find(attribute=>attribute.name===qualifiedName)?.value??null;}
 getAttributeNS(namespace,localName){
  const ns=namespace===''?null:namespace??null;
  return this.attributes.find(attribute=>attribute.namespaceURI===ns&&attribute.localName===localName)?.value??null;
 }
 hasAttribute(qualifiedName){return this.getAttribute(qualifiedName)!==null;}
 hasAttributeNS(namespace,localName){return this.getAttributeNS(namespace,localName)!==null;}
 // Text and CDATA descendants, concatenated; comments and processing instructions are not kept.
 get textContent(){
  let text='';const stack=[...this.childNodes].reverse();
  while(stack.length){
   const node=stack.pop();
   if(node.nodeType===3||node.nodeType===4)text+=node.data;
   else for(let i=node.childNodes.length-1;i>=0;i--)stack.push(node.childNodes[i]);
  }
  return text;
 }
}

class XmlDocument extends XmlNode{
 constructor(){super(9,'#document');}
 get documentElement(){return this.firstElementChild;}
 get textContent(){return null;}
}

function appendChild(parent,node){node.parentNode=parent;parent.childNodes.push(node);return node;}

function characterFromCode(code,fail){
 const allowed=code===0x9||code===0xA||code===0xD||(code>=0x20&&code<=0xD7FF)||(code>=0xE000&&code<=0xFFFD)||(code>=0x10000&&code<=0x10FFFF);
 if(!allowed)fail(`Character reference to an invalid character (code ${code})`);
 return String.fromCodePoint(code);
}
// Decodes &lt; &gt; &amp; &quot; &apos; &#N; and &#xH; (lower-case x, as XML requires). Anything else is an error.
function decodeReferences(raw,at,fail){
 if(!raw.includes('&'))return raw;
 let text='',last=0,amp;
 while((amp=raw.indexOf('&',last))!==-1){
  text+=raw.slice(last,amp);
  const semicolon=raw.indexOf(';',amp+1);
  const reference=semicolon<0?'':raw.slice(amp+1,semicolon);
  const failHere=message=>fail(message,at+amp);
  if(semicolon<0||!reference)failHere("'&' must start an entity or character reference such as &amp;");
  if(Object.hasOwn(NAMED_ENTITIES,reference))text+=NAMED_ENTITIES[reference];
  else if(/^#[0-9]+$/.test(reference))text+=characterFromCode(Number.parseInt(reference.slice(1),10),failHere);
  else if(/^#x[0-9A-Fa-f]+$/.test(reference))text+=characterFromCode(Number.parseInt(reference.slice(2),16),failHere);
  else failHere(`Unknown entity &${reference.slice(0,40)};`);
  last=semicolon+1;
 }
 return text+raw.slice(last);
}

function parse(source){
 // XML end-of-line handling: CR LF and lone CR become LF before parsing (&#13; references survive).
 let text=String(source).replace(/\r\n?/g,'\n');
 if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
 // open: elements awaiting their closing tag; scopes: the namespace bindings in force inside each of them.
 const document=new XmlDocument(),open=[],scopes=[],length=text.length;
 const rootNamespaces=new Map([['xml',XML_NS],['xmlns',XMLNS_NS]]);
 let index=0;
 const fail=(message,at=index)=>{throw new XmlParseError(message,at);};
 const current=()=>open.at(-1)??document;
 const addText=(raw,at)=>{
  if(!open.length){if(/\S/.test(raw))fail('Text is not allowed outside the root element',at);return;}
  const parent=current(),data=decodeReferences(raw,at,fail),previous=parent.lastChild;
  if(previous?.nodeType===3)previous.data+=data;else appendChild(parent,new XmlText(data));
 };
 while(index<length){
  const lt=text.indexOf('<',index);
  if(lt!==index){addText(text.slice(index,lt<0?length:lt),index);if(lt<0)break;index=lt;}
  if(text.startsWith('<?',index)){
   const close=text.indexOf('?>',index+2);if(close<0)fail('Unterminated processing instruction');
   const target=/^[^\s?]*/.exec(text.slice(index+2,close))[0];
   if(!target)fail('Processing instruction without a target');
   if(target.toLowerCase()==='xml'&&index!==0)fail('The XML declaration is only allowed at the very start of the document');
   index=close+2;
  }else if(text.startsWith('<!--',index)){
   const close=text.indexOf('-->',index+4);if(close<0)fail('Unterminated comment');
   index=close+3;
  }else if(text.startsWith('<![CDATA[',index)){
   if(!open.length)fail('CDATA section outside the root element');
   const close=text.indexOf(']]>',index+9);if(close<0)fail('Unterminated CDATA section');
   appendChild(current(),new XmlText(text.slice(index+9,close),true));
   index=close+3;
  }else if(text.startsWith('<!DOCTYPE',index)){
   if(open.length||document.documentElement)fail('DOCTYPE must come before the root element');
   let j=index+9,subset=false,quote='';
   for(;j<length;j++){
    const char=text[j];
    if(quote){if(char===quote)quote='';}
    else if(char==='"'||char==="'")quote=char;
    else if(char==='[')subset=true;
    else if(char===']')subset=false;
    else if(char==='>'&&!subset)break;
   }
   if(j>=length)fail('Unterminated DOCTYPE');
   index=j+1;
  }else if(text.startsWith('</',index)){
   QNAME.lastIndex=index+2;const name=QNAME.exec(text)?.[0];
   if(!name)fail('Malformed closing tag');
   let j=index+2+name.length;while(j<length&&isSpace(text[j]))j++;
   if(text[j]!=='>')fail(`Malformed closing tag </${name}`);
   const element=open.pop();scopes.pop();
   if(!element)fail(`Closing tag </${name}> has no matching start tag`);
   if(element.tagName!==name)fail(`Closing tag </${name}> does not match <${element.tagName}>`);
   index=j+1;
  }else{
   QNAME.lastIndex=index+1;const name=QNAME.exec(text)?.[0];
   if(!name)fail(text.startsWith('<!',index)?'Unsupported markup declaration':"'<' must start a tag; write &lt; for a literal '<'");
   if(!open.length&&document.documentElement)fail(`Only one root element is allowed; found a second root <${name}>`);
   let j=index+1+name.length,selfClosing=false;const raw=[],seen=new Set();
   for(;;){
    const before=j;while(j<length&&isSpace(text[j]))j++;
    if(text.startsWith('/>',j)){selfClosing=true;j+=2;break;}
    if(text[j]==='>'){j++;break;}
    if(j>=length)fail(`Unterminated start tag <${name}>`);
    if(j===before)fail(`Attributes of <${name}> must be separated by whitespace`,j);
    QNAME.lastIndex=j;const attributeName=QNAME.exec(text)?.[0];
    if(!attributeName)fail(`Malformed attribute in <${name}>`,j);
    j+=attributeName.length;while(j<length&&isSpace(text[j]))j++;
    if(text[j]!=='=')fail(`Attribute ${attributeName} of <${name}> has no value`,j);
    j++;while(j<length&&isSpace(text[j]))j++;
    const quote=text[j];
    if(quote!=='"'&&quote!=="'")fail(`Attribute ${attributeName} of <${name}> must be quoted`,j);
    const close=text.indexOf(quote,j+1);if(close<0)fail(`Unterminated value for attribute ${attributeName}`,j);
    const value=text.slice(j+1,close);
    if(value.includes('<'))fail(`Attribute ${attributeName} contains '<'; write &lt;`,j);
    if(seen.has(attributeName))fail(`Duplicate attribute ${attributeName} on <${name}>`,j);
    seen.add(attributeName);
    // Attribute-value normalisation: literal tabs and line feeds become spaces; character references are kept.
    raw.push([attributeName,decodeReferences(value.replace(/[\t\n]/g,' '),j+1,fail)]);
    j=close+1;
   }
   const parentNamespaces=scopes.at(-1)??rootNamespaces;
   let namespaces=parentNamespaces;
   for(const [attributeName,value] of raw){
    if(attributeName!=='xmlns'&&!attributeName.startsWith('xmlns:'))continue;
    if(namespaces===parentNamespaces)namespaces=new Map(parentNamespaces);
    if(attributeName==='xmlns')namespaces.set('',value||null);
    else{const prefix=attributeName.slice(6);if(!value)fail(`Namespace prefix ${prefix} cannot be bound to an empty name`);if(prefix==='xmlns'||(prefix==='xml'&&value!==XML_NS))fail(`Namespace prefix ${prefix} is reserved`);namespaces.set(prefix,value);}
   }
   const split=qualifiedName=>{const colon=qualifiedName.indexOf(':');return colon<0?[null,qualifiedName]:[qualifiedName.slice(0,colon),qualifiedName.slice(colon+1)];};
   const [prefix,localName]=split(name);
   const namespaceURI=prefix===null?namespaces.get('')??null:namespaces.get(prefix);
   if(namespaceURI===undefined)fail(`Namespace prefix ${prefix} on <${name}> is not declared`);
   const attributes=raw.map(([attributeName,value])=>{
    if(attributeName==='xmlns')return {name:attributeName,prefix:null,localName:'xmlns',namespaceURI:XMLNS_NS,value};
    const [attributePrefix,attributeLocal]=split(attributeName);
    // Unprefixed attributes are in no namespace, whatever the default namespace is.
    const attributeNamespace=attributePrefix===null?null:namespaces.get(attributePrefix);
    if(attributeNamespace===undefined)fail(`Namespace prefix ${attributePrefix} on attribute ${attributeName} is not declared`);
    return {name:attributeName,prefix:attributePrefix,localName:attributeLocal,namespaceURI:attributeNamespace,value};
   });
   const element=appendChild(current(),new XmlElement(name,prefix,localName,namespaceURI,attributes));
   if(!selfClosing){open.push(element);scopes.push(namespaces);}
   index=j;
  }
 }
 if(open.length)fail(`Element <${open.at(-1).tagName}> is not closed`,length);
 if(!document.documentElement)fail('The document has no root element',length);
 return document;
}

function errorDocument(source,error){
 const before=String(source).replace(/\r\n?/g,'\n').slice(0,error.index),line=before.split('\n').length,column=error.index-before.lastIndexOf('\n');
 const document=new XmlDocument(),element=appendChild(document,new XmlElement('parsererror',null,'parsererror',null,[]));
 appendChild(element,new XmlText(`XML parsing error on line ${line}, column ${column}: ${error.message}.`));
 return document;
}

export class DOMParser{
 parseFromString(source,mimeType='application/xml'){
  if(/html/i.test(String(mimeType))&&!/xhtml|xml/i.test(String(mimeType)))throw new TypeError(`This DOMParser only parses XML, not ${mimeType}`);
  try{return parse(source);}
  catch(error){if(error instanceof XmlParseError)return errorDocument(source,error);throw error;}
 }
}

// Installs the shim only when no DOMParser exists (a browser or another shim keeps its own).
export function installDOMParser(target=globalThis){
 if(typeof target.DOMParser!=='function')target.DOMParser=DOMParser;
 return target.DOMParser;
}
