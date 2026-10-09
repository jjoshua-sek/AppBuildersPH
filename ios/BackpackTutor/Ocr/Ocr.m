#import <React/RCTBridgeModule.h>

// Exposes the Swift class in Ocr.swift to React Native as NativeModules.Ocr.
@interface RCT_EXTERN_MODULE(Ocr, NSObject)
RCT_EXTERN_METHOD(recognize:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
