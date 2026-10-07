import React from "react";

const text = {
  zh:{title:"此模块暂时无法显示", body:"其他模块不受影响。可以重试，或稍后刷新页面。", retry:"重试"},
  en:{title:"This section could not be displayed", body:"Other sections are unaffected. Try again, or reload the page later.", retry:"Try again"}
};

// Contains a render error to one module so the rest of the page stays usable.
// A failed module never shows partial or substitute data: it says plainly that
// it is unavailable, consistent with the project's missing-evidence rule.
export default class ModuleBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={error:null};
    this.retry=()=>this.setState({error:null});
  }
  static getDerivedStateFromError(error){ return {error}; }
  componentDidCatch(error,info){
    console.error(`[World Food Lens] module "${this.props.name||"unknown"}" failed to render`,error,info?.componentStack);
  }
  render(){
    if(!this.state.error) return this.props.children ?? null;
    const langs=this.props.lang ? [this.props.lang] : ["zh","en"];
    return <div className="module-error" role="alert" data-module={this.props.name}>
      {langs.map(lang=><p key={lang}><b>{text[lang].title}</b> {text[lang].body}</p>)}
      <button type="button" onClick={this.retry}>{langs.map(lang=>text[lang].retry).join(" / ")}</button>
    </div>;
  }
}
