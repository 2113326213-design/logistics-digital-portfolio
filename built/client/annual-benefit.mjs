export function cleanAnnualBenefit(value){
 if(value==null||typeof value==='string'&&value.trim()==='')return null;
 if(!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0)throw Error('Annual benefit must be a non-negative CNY amount, or blank.');
 return Number(value);
}
export function formatAnnualBenefit(app){
 const amount=cleanAnnualBenefit(app?.annualBenefitCNY);
 return amount===null?'Not recorded':`¥${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(amount)} / year`;
}
